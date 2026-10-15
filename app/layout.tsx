import type { Metadata } from 'next';
import './research-paper.css';
export const metadata: Metadata={title:'证研 · 投资命题验证',description:'把投资判断拆成可检验的问题，用真实数据与原始材料形成支持、反对和无法验证的证据链。',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
