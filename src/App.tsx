import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes/AppRoutes";
import { ConfigProvider } from "antd";

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#2F7D32",
          colorError: "#B11226", 
          fontFamily: "Inter, sans-serif",
        },
        components: {
          Layout: {
            siderBg: "#E6E7E3",
            headerBg: "#F5F5F3",
          },
          Menu: {
            darkItemBg: "#E6E7E3",
            darkItemColor: "#2F7D32",
            darkItemHoverBg: "#6FBF8E",
            darkItemHoverColor: "#FFFFFF",
            darkItemSelectedBg: "#2F7D32",
            darkItemSelectedColor: "#FFFFFF",
          },
        },
      }}
    >
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
