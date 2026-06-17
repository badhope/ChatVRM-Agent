import { buildUrl } from "@/utils/buildUrl";
import Head from "next/head";
export const Meta = () => {
  const title = "ChatVRM Agent";
  const description =
    "A 3D digital-human conversation framework — VRM avatars, 13 LLM providers, 5 TTS engines, voice input, lip sync, and a glassmorphism UI.";
  const imageUrl = buildUrl("/ogp.png");
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Head>
  );
};
