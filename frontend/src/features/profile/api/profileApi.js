import axiosClient from "../../../shared/api/axiosClient";

export const getProfileApi = async () => {
  const response = await axiosClient.get("/auth/profile");
  return response.data;
};

export const updateProfileApi = async (payload) => {
  const response = await axiosClient.patch("/auth/profile", payload);
  return response.data;
};

export const changeMyPasswordApi = async (payload) => {
  const response = await axiosClient.patch("/auth/profile/password", payload);
  return response.data;
};

export const createTelegramBotApi = async (payload) => {
  const response = await axiosClient.post("/auth/profile/telegram-bots", payload);
  return response.data;
};

export const updateTelegramBotApi = async (botId, payload) => {
  const response = await axiosClient.patch(`/auth/profile/telegram-bots/${botId}`, payload);
  return response.data;
};

export const deleteTelegramBotApi = async (botId) => {
  const response = await axiosClient.delete(`/auth/profile/telegram-bots/${botId}`);
  return response.data;
};

export const testTelegramBotApi = async (botId) => {
  const response = await axiosClient.post(`/auth/profile/telegram-bots/${botId}/test`);
  return response.data;
};
