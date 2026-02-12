import React, { createContext, useState, useEffect } from "react";
import axios from "axios";
import { StatusCodes } from "http-status-codes";
import { useNavigate } from "react-router-dom";

export const AuthContext = createContext({});


const client = axios.create({
  baseURL: "https://videoconferencing-zcql.onrender.com/api/v1/users",
});

export const AuthProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();

  
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUserData(JSON.parse(storedUser));
    }
  }, []);

  const handleRegister = async (name, username, password) => {
    const request = await client.post("/register", {
      name,
      username,
      password,
    });

    if (request.status === StatusCodes.CREATED) {
      return request.data.message;
    }
  };

  const handleLogin = async (username, password) => {
    const request = await client.post("/login", {
      username,
      password,
    });

    if (request.status === StatusCodes.OK) {
      const user = request.data.user;

      
      localStorage.setItem("token", request.data.token);
      localStorage.setItem("user", JSON.stringify(user));

      setUserData(user);
      navigate("/");
    }
  };

  const handleLogout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  setUserData(null);
  navigate("/");
};

  return (
    <AuthContext.Provider
      value={{
        userData,
        handleRegister,
        handleLogin,
        handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
