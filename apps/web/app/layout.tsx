import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "../components/AppProviders";

export const metadata: Metadata = {
  title: "침수 취약지점 통제 이행 관리 시스템",
  description: "충청북도 시·군 재난상황실용 상황실 대시보드 프로토타입",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
