import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import BatchPage from "./pages/BatchPage";
import DomainPage from "./pages/DomainPage";
import Navbar from "./components/Navbar";
import SessionTimeout from "./components/SessionTimeout";
import MyPreviewPage from "./pages/MyPreviewPage";
import UploaderWorkspacePage from "./pages/UploaderWorkspacePage";
import ProcessorWorkspacePage from "./pages/ProcessorWorkspacePage";



function App() {
  return (
    <BrowserRouter>
      <SessionTimeout />
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/batches" element={<BatchPage />} />
        <Route path="/batches/:batchId" element={<DomainPage />} />
        <Route path="/my-preview" element={<MyPreviewPage />} />
        <Route path="/uploader" element={<UploaderWorkspacePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/processor" element={<ProcessorWorkspacePage />}/>
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;
