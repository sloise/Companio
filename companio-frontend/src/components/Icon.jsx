const paths = {
  x:"m6 6 12 12M18 6 6 18", check:"m5 12 4 4L19 6", alert:"m12 3 10 18H2L12 3Zm0 6v5m0 3h.01", info:"M12 8h.01M11 12h1v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  home:"m3 10 9-7 9 7v11h-6v-7H9v7H3Z", paw:"M8 13c-2 1-4 4-3 6s4 0 7 0 6 2 7 0-1-5-3-6-6-1-8 0ZM8 7c0 4-5 4-5 0s5-4 5 0Zm6-3c0 4-4 4-4 0s4-4 4 0Zm7 3c0 4-5 4-5 0s5-4 5 0Z",
  clipboard:"M9 4H5v18h14V4h-4M9 2h6v5H9ZM8 12h8M8 16h6", heart:"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  shield:"m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 10 3 3 7-7", users:"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M15 3a4 4 0 0 1 0 8m8 10v-2a4 4 0 0 0-3-4M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  grid:"M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z", clock:"M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2", history:"M3 11a9 9 0 1 1 2.5 7M3 3v8h8M12 7v5l3 2",
  edit:"m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5", trash:"M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7", plus:"M12 5v14M5 12h14", mail:"M3 5h18v14H3Zm0 0 9 8 9-8", arrow:"M4 12h16m-6-6 6 6-6 6", back:"M20 12H4m6-6-6 6 6 6", refresh:"M20 7A9 9 0 1 0 21 15M20 2v6h-6",
  eye:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", eyeOff:"m3 3 18 18M9.8 5.2A11 11 0 0 1 12 5c7 0 10 7 10 7a18 18 0 0 1-3 4M6 6a18 18 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4",
  logout:"M9 3H3v18h6m5-14 5 5-5 5m-6-5h13", search:"M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z", user:"M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", lock:"M5 10h14v12H5Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v3", cat:"M4 11V3l6 4h4l6-4v8c3 12-19 12-16 0Zm4 1h.01m8 0h.01m-6 4h4", dog:"M7 7 3 4 1 12l5 3m11-8 4-3 2 8-5 3M6 7h12v10c0 6-12 6-12 0V7Zm3 5h.01m6 0h.01m-4 5h2", ball:"M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM4 6c7 2 7 10 0 12m16-12c-7 2-7 10 0 12",
};
export default function Icon({ name, size = 20, className = "", ...props }) {
 return <svg className={"icon " + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}><path d={paths[name] || paths.paw} /></svg>;
}
