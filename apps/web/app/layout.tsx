import "./style.css";
import { GeistSans } from "geist/font/sans";
export const metadata = {
  title: "Flight Recorder · Agent 支付记录",
  description: "连接你的 Agent，查看支付记录，随时导出可核验的证据。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
