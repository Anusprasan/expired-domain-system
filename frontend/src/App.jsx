import { BrowserRouter, Routes, Route } from "react-router-dom";

import HomePage from "./pages/HomePage";
import UploadPage from "./pages/UploadPage";
import BatchPage from "./pages/BatchPage";
import DomainPage from "./pages/DomainPage";
import Navbar from "./components/Navbar";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/batches" element={<BatchPage />} />
        <Route path="/batches/:batchId" element={<DomainPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;