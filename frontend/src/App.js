import React from "react";
import { Route, BrowserRouter, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Authentication from "./pages/Authentication";
import { AuthProvider } from "./contexts/AuthContext";
import "./App.css";
import VideoMeet from "./pages/VideoMeet";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Authentication />} />

            <Route path = "/:url" element = {<VideoMeet />}/>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
