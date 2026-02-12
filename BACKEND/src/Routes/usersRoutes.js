const express = require("express");
const router = express.Router();

const { register, login } = require("../controllers/user.controller");

router.route("/login").post(login)
router.route("/register").post(register)
router.route("/add_to_activity")
router.route("/get_activity")



module.exports = router;
