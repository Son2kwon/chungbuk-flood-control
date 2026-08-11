/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/domain, packages/data는 미리 빌드된 JS가 아니라 워크스페이스 소스(TS)를
  // 그대로 참조한다. Next의 컴파일러가 이 두 패키지를 직접 트랜스파일하도록 지정한다.
  transpilePackages: ["@chungbuk/domain", "@chungbuk/data"],
};

export default nextConfig;
