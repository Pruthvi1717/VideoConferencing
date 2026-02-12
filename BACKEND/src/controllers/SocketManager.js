const { Server } = require("socket.io");

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_ROOM_SIZE        = parseInt(process.env.MAX_ROOM_SIZE, 10)        || 10;
const MAX_MESSAGE_LENGTH   = parseInt(process.env.MAX_MESSAGE_LENGTH, 10)   || 500;
const MAX_MESSAGES_STORED  = parseInt(process.env.MAX_MESSAGES_STORED, 10)  || 100;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 1000;
const RATE_LIMIT_MAX_MSGS  = parseInt(process.env.RATE_LIMIT_MAX_MSGS, 10)  || 5;

// ─── In-memory store ──────────────────────────────────────────────────────────
// NOTE: For multi-process / multi-instance deployments, replace these Maps
// with a Redis adapter: https://socket.io/docs/v4/redis-adapter/

/** @type {Map<string, string[]>}  roomId → [socketId, ...] */
const connections = new Map();

/** @type {Map<string, Array<{sender:string, data:string, socketId:string}>>} */
const messages = new Map();

/** @type {Map<string, number>}  socketId → join timestamp (ms) */
const timeOnline = new Map();

/** @type {Map<string, {count:number, windowStart:number}>}  per-socket rate limit */
const rateLimitStore = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize a chat message: trim, strip control characters, enforce max length.
 */
const sanitizeMessage = (raw) => {
    if (typeof raw !== "string") return "";
    return raw
        .trim()
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, "")   // strip control characters
        .slice(0, MAX_MESSAGE_LENGTH);
};

/**
 * Sanitize a display name: trim, limit to 50 chars, no HTML-breaking chars.
 */
const sanitizeName = (raw) => {
    if (typeof raw !== "string") return "Anonymous";
    return raw
        .trim()
        .replace(/[<>"'`]/g, "")
        .slice(0, 50) || "Anonymous";
};

/**
 * Sanitize a room/path id: alphanumeric + dash/underscore only.
 * Returns null if invalid.
 */
const sanitizeRoomId = (raw) => {
    if (typeof raw !== "string") return null;
    const cleaned = raw.trim().toUpperCase();
    return /^[A-Z0-9_-]{3,20}$/.test(cleaned) ? cleaned : null;
};

/**
 * Find which room a socket currently belongs to.
 * Returns the roomId string or null.
 */
const findSocketRoom = (socketId) => {
    for (const [roomId, members] of connections.entries()) {
        if (members.includes(socketId)) return roomId;
    }
    return null;
};

/**
 * Check and update per-socket message rate limit.
 * Returns true if the socket is within limits, false if throttled.
 */
const checkRateLimit = (socketId) => {
    const now = Date.now();
    const state = rateLimitStore.get(socketId) || { count: 0, windowStart: now };

    if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
        // New window
        rateLimitStore.set(socketId, { count: 1, windowStart: now });
        return true;
    }

    if (state.count >= RATE_LIMIT_MAX_MSGS) return false;

    state.count += 1;
    rateLimitStore.set(socketId, state);
    return true;
};

/**
 * Clean up all state for a disconnected socket.
 * Returns the roomId the socket was in, or null.
 */
const removeSocketFromRoom = (socketId) => {
    const roomId = findSocketRoom(socketId);
    if (!roomId) return null;

    const members = connections.get(roomId);
    const updated = members.filter((id) => id !== socketId);

    if (updated.length === 0) {
        // Last person left — clean up entire room
        connections.delete(roomId);
        messages.delete(roomId);
    } else {
        connections.set(roomId, updated);
    }

    timeOnline.delete(socketId);
    rateLimitStore.delete(socketId);
    return roomId;
};

// ─── Socket Server ────────────────────────────────────────────────────────────

const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin:  process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"],
        },
        // Tune transport for reliability
        pingTimeout:  60000,
        pingInterval: 25000,
    });

    io.on("connection", (socket) => {
        console.log(`[socket] connected: ${socket.id}`);

        // ── join-call ──────────────────────────────────────────────────────────
        socket.on("join-call", (rawPath) => {
            // Validate & sanitize room id
            const roomId = sanitizeRoomId(rawPath);
            if (!roomId) {
                socket.emit("error", { message: "Invalid meeting ID." });
                return;
            }

            // Prevent duplicate joins
            if (findSocketRoom(socket.id)) {
                socket.emit("error", { message: "Already in a meeting." });
                return;
            }

            // Enforce room size limit
            const members = connections.get(roomId) || [];
            if (members.length >= MAX_ROOM_SIZE) {
                socket.emit("error", { message: "Meeting is full." });
                return;
            }

            members.push(socket.id);
            connections.set(roomId, members);
            timeOnline.set(socket.id, Date.now());

            // Notify every member (including the joiner) of the full updated list
            members.forEach((memberId) => {
                io.to(memberId).emit("user-joined", socket.id, members);
            });

            // Replay chat history to the new joiner only
            const history = messages.get(roomId);
            if (history?.length) {
                history.forEach(({ data, sender, socketId }) => {
                    socket.emit("chat-message", data, sender, socketId);
                });
            }

            console.log(`[socket] ${socket.id} joined room ${roomId} (${members.length}/${MAX_ROOM_SIZE})`);
        });

        // ── signal (WebRTC) ────────────────────────────────────────────────────
        socket.on("signal", (toId, message) => {
            // Only forward if the target is in the same room
            const senderRoom   = findSocketRoom(socket.id);
            const receiverRoom = findSocketRoom(toId);

            if (!senderRoom || senderRoom !== receiverRoom) return;

            io.to(toId).emit("signal", socket.id, message);
        });

        // ── chat-message ───────────────────────────────────────────────────────
        socket.on("chat-message", (rawData, rawSender) => {
            // Rate limiting
            if (!checkRateLimit(socket.id)) {
                socket.emit("error", { message: "Sending too fast. Please slow down." });
                return;
            }

            const roomId = findSocketRoom(socket.id);
            if (!roomId) return;

            const data   = sanitizeMessage(rawData);
            const sender = sanitizeName(rawSender);

            if (!data) return; // empty after sanitization

            // Store message (cap history size to avoid unbounded memory growth)
            if (!messages.has(roomId)) messages.set(roomId, []);
            const roomMessages = messages.get(roomId);
            if (roomMessages.length >= MAX_MESSAGES_STORED) {
                roomMessages.shift(); // drop oldest
            }
            roomMessages.push({ sender, data, socketId: socket.id });

            console.log(`[chat] room=${roomId} sender=${sender}: ${data}`);

            // Broadcast to everyone in the room (including sender for echo confirmation)
            connections.get(roomId).forEach((memberId) => {
                io.to(memberId).emit("chat-message", data, sender, socket.id);
            });
        });

        // ── disconnect ─────────────────────────────────────────────────────────
        socket.on("disconnect", (reason) => {
            const joinTime = timeOnline.get(socket.id);
            const duration = joinTime
                ? Math.round((Date.now() - joinTime) / 1000)
                : 0;

            console.log(`[socket] disconnected: ${socket.id} | reason: ${reason} | online: ${duration}s`);

            const roomId = findSocketRoom(socket.id);

            if (roomId) {
                // Notify remaining members before removing
                const members = connections.get(roomId) || [];
                members.forEach((memberId) => {
                    if (memberId !== socket.id) {
                        io.to(memberId).emit("user-left", socket.id);
                    }
                });
            }

            removeSocketFromRoom(socket.id);
        });
    });

    return io;
};

module.exports = { connectToSocket };