import axiosClient from "../../../shared/api/axiosClient";

export const loginApi = async (payload) => {
  const response = await axiosClient.post("/auth/login", payload);
  return response.data;
};

export const getMeApi = async () => {
  const response = await axiosClient.get("/auth/me");
  return response.data;
};

export const forgotPasswordApi = async (payload) => {
  const response = await axiosClient.post("/password-reset/forgot-password", payload);
  return response.data;
};

export const resetPasswordApi = async (payload) => {
  const response = await axiosClient.post("/password-reset/reset-password", payload);
  return response.data;
};
