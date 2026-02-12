const express = require("express");

const mongoose = require("mongoose");
const cors = require('cors');
const {Server} = require('socket.io');
const {createServer} = require('node:http');
require('dotenv').config();

const {connectToSocket} = require('./controllers/SocketManager');
const {User}=require("./models/userModel");
const {Meeting}=require("./models/meeting.model");
const userRoutes= require("./Routes/usersRoutes");



const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", process.env.PORT || 3000);
app.use(cors());
app.use(express.json({ limit: "40kb"}));
app.use(express.urlencoded({ limit: "40kb", extended: true}));

app.use("/api/v1/users", userRoutes);

app.get('/', (req,res)=>{
    res.send('Hello World');
})
mongoose.connect(process.env.MONGO_DB)
.then(() => {
    console.log('Connected to MongoDB');
    server.listen(app.get("port"), () => {
    console.log('Server is running on port ' + app.get("port"));
    
  });
})
.catch((err) => {
    console.error('Error connecting to MongoDB', err);
});