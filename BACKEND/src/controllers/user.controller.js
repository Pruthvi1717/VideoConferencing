const User = require("../models/userModel");
const { StatusCodes } = require("http-status-codes");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const JWT_SECRET      = process.env.JWT_SECRET;
const JWT_EXPIRES_IN  = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS   = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

if (!JWT_SECRET) {
    // Fail loudly at startup — never allow a missing secret in production
    throw new Error("FATAL: JWT_SECRET environment variable is not set.");
}

/** Strip leading/trailing whitespace and collapse internal spaces */
const sanitizeString = (str) =>
    typeof str === "string" ? str.trim() : "";

/** Basic username rules: 3–30 chars, alphanumeric + underscore/hyphen only */
const isValidUsername = (u) => /^[a-zA-Z0-9_-]{3,30}$/.test(u);

/** Minimum password length */
const isValidPassword = (p) => typeof p === "string" && p.length >= 6;

/** Name: 2–50 printable characters */
const isValidName = (n) => typeof n === "string" && n.trim().length >= 2 && n.trim().length <= 50;

// ─── Login ────────────────────────────────────────────────────────────────────

const login = async (req, res) => {
    const username = sanitizeString(req.body.username);
    const password = req.body.password; // never trim passwords

    // ── Validate input ──
    if (!username || !password) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Username and password are required." });
    }

    if (!isValidUsername(username)) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Invalid username format." });
    }

    try {
        const user = await User.findOne({ username }).select("+password");

        // Use a constant-time response to prevent user enumeration
        if (!user) {
            await bcrypt.hash("dummy_prevent_timing_attack", BCRYPT_ROUNDS);
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({ message: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res
                .status(StatusCodes.UNAUTHORIZED)
                .json({ message: "Invalid credentials." });
        }

        const payload = {
            id:       user._id,
            username: user.username,
        };

        const token = jwt.sign(payload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
            issuer:    "apna-video-call",
        });

        return res
            .status(StatusCodes.OK)
            .json({
                message: "Login successful.",
                token,
                user: {
                    id:       user._id,
                    name:     user.name,
                    username: user.username,   // ← was incorrectly user.name
                },
            });

    } catch (err) {
        console.error("[login] error:", err);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: "Something went wrong. Please try again." });
    }
};

// ─── Register ─────────────────────────────────────────────────────────────────

const register = async (req, res) => {
    const name     = sanitizeString(req.body.name);
    const username = sanitizeString(req.body.username);
    const password = req.body.password;

    // ── Validate input ──
    if (!name || !username || !password) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Name, username, and password are required." });
    }

    if (!isValidName(name)) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Name must be between 2 and 50 characters." });
    }

    if (!isValidUsername(username)) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Username must be 3–30 characters: letters, numbers, _ or - only." });
    }

    if (!isValidPassword(password)) {
        return res
            .status(StatusCodes.BAD_REQUEST)
            .json({ message: "Password must be at least 6 characters." });
    }

    try {
        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res
                .status(StatusCodes.CONFLICT)
                .json({ message: "Username is already taken." });
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const newUser = new User({
            name,
            username,
            password: hashedPassword,
        });

        await newUser.save();

        return res
            .status(StatusCodes.CREATED)
            .json({ message: "Account created successfully. Please sign in." });

    } catch (err) {
        console.error("[register] error:", err);
        return res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: "Something went wrong. Please try again." });
    }
};

module.exports = { login, register };