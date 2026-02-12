import React, { useState, useEffect, useRef } from 'react';
import Badge from "@mui/material/Badge";
import io from 'socket.io-client';
import "./VideoMeet.css";

const server_url = "https://videoconferencing-zcql.onrender.com";

const peerConfigConnections = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

export default function VideoMeet() {
    const SocketRef         = useRef();
    const socketIdRef       = useRef();
    const localVideoRef     = useRef();
    const videoRef          = useRef({});
    // Keep connections in a ref so callbacks always see latest value
    const connectionsRef    = useRef({});

    const [videoAvailable,   setVideoAvailable]   = useState(false);
    const [audioAvailable,   setAudioAvailable]   = useState(false);
    const [screenAvailable,  setScreenAvailable]  = useState(false);

    const [video,   setVideo]   = useState(false);
    const [audio,   setAudio]   = useState(false);
    const [screen,  setScreen]  = useState(false);

    const [videos,           setVideos]           = useState([]);
    const [messages,         setMessages]         = useState([]);
    const [message,          setMessage]          = useState("");
    const [newMessages,      setNewMessages]       = useState(0);
    const [showChat,         setShowChat]         = useState(false);

    const [askForUsername,   setAskForUsername]   = useState(true);
    const [username,         setUsername]         = useState("");
    const [meetingId,        setMeetingId]        = useState("");
    const [participantCount, setParticipantCount] = useState(1);

    // ─── Permissions ────────────────────────────────────────────────────────────
    const getPermission = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true });
            s.getTracks().forEach(t => t.stop());
            setVideoAvailable(true);
        } catch { setVideoAvailable(false); }

        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach(t => t.stop());
            setAudioAvailable(true);
        } catch { setAudioAvailable(false); }

        setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
    };

    useEffect(() => { getPermission(); }, []);

    // ─── Local stream helpers ────────────────────────────────────────────────────
    const getUserMediaSuccess = (stream) => {
        window.localStream = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Push new tracks to every existing peer connection
        Object.entries(connectionsRef.current).forEach(([id, pc]) => {
            if (id === socketIdRef.current) return;
            const senders = pc.getSenders();
            stream.getTracks().forEach(track => {
                const existing = senders.find(s => s.track?.kind === track.kind);
                if (existing) existing.replaceTrack(track);
                else          pc.addTrack(track, stream);
            });
        });
    };

    useEffect(() => {
        if (video === undefined && audio === undefined) return;
        if (video || audio) {
            navigator.mediaDevices
                .getUserMedia({
                    video: video ? { width: 1280, height: 720 } : false,
                    audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
                })
                .then(getUserMediaSuccess)
                .catch(console.error);
        } else {
            window.localStream?.getTracks().forEach(t => t.stop());
        }
    }, [audio, video]);

    // ─── WebRTC signalling ───────────────────────────────────────────────────────
    const gotMessageFromServer = (fromId, rawMsg) => {
        if (fromId === socketIdRef.current) return;

        const signal = JSON.parse(rawMsg);
        const pc     = connectionsRef.current[fromId];
        if (!pc) return;

        if (signal.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    if (signal.sdp.type === 'offer') {
                        pc.createAnswer()
                            .then(desc => pc.setLocalDescription(desc))
                            .then(() =>
                                SocketRef.current.emit('signal', fromId,
                                    JSON.stringify({ sdp: pc.localDescription }))
                            )
                            .catch(console.error);
                    }
                })
                .catch(console.error);
        }

        if (signal.ice) {
            pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(console.error);
        }
    };

    // Creates (or re-uses) a peer connection for `id`.
    // `shouldOffer` – true when WE should send the offer.
    const createPeerConnection = (id, shouldOffer) => {
        // If a stale connection exists, close it first
        if (connectionsRef.current[id]) {
            connectionsRef.current[id].close();
            delete connectionsRef.current[id];
        }

        const pc = new RTCPeerConnection(peerConfigConnections);
        connectionsRef.current[id] = pc;

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                SocketRef.current.emit('signal', id,
                    JSON.stringify({ ice: e.candidate }));
            }
        };

        pc.ontrack = (e) => {
            const stream = e.streams[0];
            setVideos(prev => {
                const exists = prev.find(v => v.id === id);
                if (exists) return prev.map(v => v.id === id ? { ...v, stream } : v);
                return [...prev, { id, stream }];
            });
            setTimeout(() => {
                if (videoRef.current[id]) videoRef.current[id].srcObject = stream;
            }, 100);
        };

        // Add all local tracks
        if (window.localStream) {
            window.localStream.getTracks().forEach(track =>
                pc.addTrack(track, window.localStream)
            );
        }

        if (shouldOffer) {
            pc.createOffer()
                .then(desc => pc.setLocalDescription(desc))
                .then(() =>
                    SocketRef.current.emit('signal', id,
                        JSON.stringify({ sdp: pc.localDescription }))
                )
                .catch(console.error);
        }

        return pc;
    };

    // ─── Socket.IO ───────────────────────────────────────────────────────────────
    const connectToSocketServer = (meetingCode) => {
        SocketRef.current = io.connect(server_url, { secure: false });

        SocketRef.current.on('signal', gotMessageFromServer);

        SocketRef.current.on('connect', () => {
            socketIdRef.current = SocketRef.current.id;
            SocketRef.current.emit('join-call', meetingCode);

            // ── Chat ──────────────────────────────────────────────────────────
            SocketRef.current.on('chat-message', (data, sender) => {
                setMessages(prev => [...prev, { sender, data }]);
                setNewMessages(prev => prev + 1);   // always increment; reset on open
            });

            // ── User left ────────────────────────────────────────────────────
            SocketRef.current.on('user-left', (id) => {
                setVideos(prev => prev.filter(v => v.id !== id));
                setParticipantCount(prev => Math.max(1, prev - 1));
                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close();
                    delete connectionsRef.current[id];
                }
                delete videoRef.current[id];
            });

            // ── User joined ───────────────────────────────────────────────────
            // `clients` is the FULL list of sockets currently in the room.
            // We iterate over everyone and ensure a connection exists.
            // The rule: lower socket-id → sends the offer.
            SocketRef.current.on('user-joined', (id, clients) => {
                setParticipantCount(clients.length);

                clients.forEach(clientId => {
                    if (clientId === socketIdRef.current) return;
                    if (!connectionsRef.current[clientId]) {
                        // We offer if our id sorts before theirs
                        const shouldOffer = socketIdRef.current < clientId;
                        createPeerConnection(clientId, shouldOffer);
                    }
                });
            });
        });
    };

    // ─── Meeting actions ─────────────────────────────────────────────────────────
    const generateMeetingId = () =>
        Math.random().toString(36).substring(2, 10).toUpperCase();

    const joinMeeting = (code) => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer(code);
        setAskForUsername(false);
    };

    const createMeeting = () => {
        if (!username.trim()) return alert("Please enter a username");
        const id = generateMeetingId();
        setMeetingId(id);
        joinMeeting(id);
    };

    const joinMeetingById = () => {
        if (!username.trim()) return alert("Please enter a username");
        if (!meetingId.trim())  return alert("Please enter a meeting ID");
        joinMeeting(meetingId.trim());
    };

    const handleDisconnect = () => {
        window.localStream?.getTracks().forEach(t => t.stop());
        Object.values(connectionsRef.current).forEach(pc => pc.close());
        connectionsRef.current = {};
        SocketRef.current?.disconnect();

        setAskForUsername(true);
        setVideos([]);
        setMessages([]);
        setVideo(false);
        setAudio(false);
        setScreen(false);
        setMeetingId("");
        setParticipantCount(1);
        window.localStream = null;
    };

    // ─── Media controls ──────────────────────────────────────────────────────────
    const handleVideo = async () => {
        if (video) {
            const track = window.localStream?.getVideoTracks()[0];
            if (track) { track.stop(); window.localStream.removeTrack(track); }
            setVideo(false);
        } else {
            try {
                const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
                const track = s.getVideoTracks()[0];
                if (!window.localStream) window.localStream = new MediaStream();
                window.localStream.addTrack(track);
                if (localVideoRef.current) localVideoRef.current.srcObject = window.localStream;
                Object.values(connectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(track);
                    else        pc.addTrack(track, window.localStream);
                });
                setVideo(true);
            } catch (err) {
                console.error(err);
                alert("Could not access camera");
            }
        }
    };

    const handleAudio = async () => {
        if (audio) {
            const track = window.localStream?.getAudioTracks()[0];
            if (track) { track.stop(); window.localStream.removeTrack(track); }
            setAudio(false);
        } else {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                const track = s.getAudioTracks()[0];
                if (!window.localStream) window.localStream = new MediaStream();
                window.localStream.addTrack(track);
                if (localVideoRef.current) localVideoRef.current.srcObject = window.localStream;
                Object.values(connectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (sender) sender.replaceTrack(track);
                    else        pc.addTrack(track, window.localStream);
                });
                setAudio(true);
            } catch (err) {
                console.error(err);
                alert("Could not access microphone");
            }
        }
    };

    const handleScreen = async () => {
        if (screen) {
            setScreen(false);
            if (window.localStream && video) {
                try {
                    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
                    const newTrack = s.getVideoTracks()[0];
                    const old = window.localStream.getVideoTracks()[0];
                    if (old) { window.localStream.removeTrack(old); old.stop(); }
                    window.localStream.addTrack(newTrack);
                    if (localVideoRef.current) localVideoRef.current.srcObject = window.localStream;
                    Object.values(connectionsRef.current).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(newTrack);
                    });
                } catch (err) { console.error(err); }
            }
        } else {
            try {
                const ss = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
                const screenTrack = ss.getVideoTracks()[0];

                const newStream = new MediaStream([screenTrack]);
                const audioTrack = window.localStream?.getAudioTracks()[0];
                if (audioTrack) newStream.addTrack(audioTrack);

                window.localStream = newStream;
                if (localVideoRef.current) localVideoRef.current.srcObject = newStream;

                Object.values(connectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });

                setScreen(true);
                screenTrack.onended = () => handleScreen();
            } catch (err) { console.error(err); }
        }
    };

    // ─── Chat ────────────────────────────────────────────────────────────────────
    const sendMessage = () => {
        if (!message.trim()) return;
        SocketRef.current.emit('chat-message', message, username);
        setMessage("");
    };

    const handleChatToggle = () => {
        setShowChat(v => !v);
        if (!showChat) setNewMessages(0);
    };

    const copyMeetingId = () => {
        navigator.clipboard.writeText(meetingId);
        alert("Meeting ID copied!");
    };

    // Sync video refs
    useEffect(() => {
        videos.forEach(v => {
            if (videoRef.current[v.id] && v.stream)
                videoRef.current[v.id].srcObject = v.stream;
        });
    }, [videos]);

    // ─── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="video-meet-container">
            {askForUsername ? (
                /* ── Lobby ── */
                <div className="lobby-container">
                    <div className="lobby-card">
                        <div className="lobby-logo">
                            <span className="logo-icon">📹</span>
                            <h1>Apna Video Call</h1>
                            <p>HD video meetings, free forever</p>
                        </div>

                        <div className="lobby-form">
                            <div className="input-group">
                                <label>Your Name</label>
                                <input
                                    type="text"
                                    placeholder="Enter your name"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && createMeeting()}
                                />
                            </div>

                            <button className="btn-primary" onClick={createMeeting}>
                                <span>🎬</span> Create New Meeting
                            </button>

                            <div className="divider"><span>or join existing</span></div>

                            <div className="input-group">
                                <label>Meeting ID</label>
                                <input
                                    type="text"
                                    placeholder="Enter Meeting ID"
                                    value={meetingId}
                                    onChange={e => setMeetingId(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && joinMeetingById()}
                                />
                            </div>

                            <button className="btn-secondary" onClick={joinMeetingById}>
                                <span>🚀</span> Join Meeting
                            </button>
                        </div>

                        <div className="video-preview">
                            <video ref={localVideoRef} autoPlay muted playsInline />
                            <div className="preview-label">Camera preview</div>
                        </div>
                    </div>
                </div>
            ) : (
                /* ── Meeting Room ── */
                <div className="meeting-container">
                    {/* Header */}
                    <div className="meeting-header">
                        <div className="header-left">
                            <span className="app-name">📹 Apna Video Call</span>
                        </div>
                        <div className="header-center">
                            <span className="meeting-id-label">Meeting ID:</span>
                            <code className="meeting-id-code">{meetingId}</code>
                            <button className="copy-btn" onClick={copyMeetingId} title="Copy ID">📋</button>
                        </div>
                        <div className="header-right">
                            <div className="participants-badge">
                                <span className="participant-dot" />
                                {participantCount} participant{participantCount !== 1 ? 's' : ''}
                            </div>
                            <span className="username-display">{username}</span>
                        </div>
                    </div>

                    {/* Video Grid */}
                    <div className={`video-grid participants-${Math.min(videos.length + 1, 6)}`}>
                        <div className="video-tile local-tile">
                            <video ref={localVideoRef} autoPlay muted playsInline />
                            <div className="tile-overlay">
                                <span className="tile-name">You ({username})</span>
                                <div className="tile-indicators">
                                    {!audio && <span className="indicator muted">🔇</span>}
                                    {!video && <span className="indicator no-video">📷</span>}
                                </div>
                            </div>
                            {!video && (
                                <div className="video-off-placeholder">
                                    <div className="avatar-circle">{username[0]?.toUpperCase()}</div>
                                </div>
                            )}
                        </div>

                        {videos.map(v => (
                            <div key={v.id} className="video-tile remote-tile">
                                <video
                                    ref={el => {
                                        if (el) {
                                            videoRef.current[v.id] = el;
                                            if (v.stream) el.srcObject = v.stream;
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                />
                                <div className="tile-overlay">
                                    <span className="tile-name">Participant {v.id.slice(0, 4)}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="controls-bar">
                        <button
                            className={`ctrl-btn ${audio ? 'ctrl-active' : 'ctrl-muted'}`}
                            onClick={handleAudio}
                            title={audio ? "Mute" : "Unmute"}
                        >
                            <span className="ctrl-icon">{audio ? '🎤' : '🔇'}</span>
                            <span className="ctrl-label">{audio ? 'Mute' : 'Unmute'}</span>
                        </button>

                        <button
                            className={`ctrl-btn ${video ? 'ctrl-active' : 'ctrl-muted'}`}
                            onClick={handleVideo}
                            title={video ? "Stop Video" : "Start Video"}
                        >
                            <span className="ctrl-icon">{video ? '📹' : '🚫'}</span>
                            <span className="ctrl-label">{video ? 'Stop Video' : 'Start Video'}</span>
                        </button>

                        {screenAvailable && (
                            <button
                                className={`ctrl-btn ${screen ? 'ctrl-active' : ''}`}
                                onClick={handleScreen}
                                title={screen ? "Stop Sharing" : "Share Screen"}
                            >
                                <span className="ctrl-icon">🖥️</span>
                                <span className="ctrl-label">{screen ? 'Stop Share' : 'Share Screen'}</span>
                            </button>
                        )}

                        <button
                            className={`ctrl-btn ${showChat ? 'ctrl-active' : ''}`}
                            onClick={handleChatToggle}
                            title="Chat"
                        >
                            <Badge badgeContent={newMessages} color="error">
                                <span className="ctrl-icon">💬</span>
                            </Badge>
                            <span className="ctrl-label">Chat</span>
                        </button>

                        <button className="ctrl-btn ctrl-danger" onClick={handleDisconnect} title="Leave">
                            <span className="ctrl-icon">📞</span>
                            <span className="ctrl-label">Leave</span>
                        </button>
                    </div>

                    {/* Chat panel */}
                    <div className={`chat-panel ${showChat ? 'chat-open' : ''}`}>
                        <div className="chat-header">
                            <h3>In-Meeting Chat</h3>
                            <button className="chat-close" onClick={handleChatToggle}>✕</button>
                        </div>

                        <div className="chat-messages" id="chat-scroll">
                            {messages.length === 0 && (
                                <div className="chat-empty">No messages yet. Say hi! 👋</div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`chat-msg ${msg.sender === username ? 'own-msg' : ''}`}>
                                    <span className="msg-sender">{msg.sender}</span>
                                    <span className="msg-body">{msg.data}</span>
                                </div>
                            ))}
                        </div>

                        <div className="chat-input-row">
                            <input
                                type="text"
                                placeholder="Type a message…"
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                            />
                            <button onClick={sendMessage}>Send</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}