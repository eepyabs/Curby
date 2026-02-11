import { Platform } from "react-native";

// Android emulator uses 10.0.2.2 to reach host machine's localhost
// Physical device: replace with your machine's LAN IP (e.g. 192.168.1.x)
const DEV_HOST = Platform.select({
  android: "10.0.2.2",
  ios: "localhost",
  default: "localhost",
});

export const API_BASE_URL = `http://${DEV_HOST}:5049`;
