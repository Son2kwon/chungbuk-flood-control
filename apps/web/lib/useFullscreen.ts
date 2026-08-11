"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 감사 로그/비교 화면처럼 발표에서 단독으로 띄우는 화면용. Fullscreen API를 특정 컨테이너에만 건다. */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void ref.current?.requestFullscreen();
    }
  }, []);

  return { ref, isFullscreen, toggle };
}
