import "@/styles/globals.css";
import type { AppProps } from "next/app";
import "@charcoal-ui/icons";
import { I18nProvider } from "@/features/i18n/i18nContext";
import { ToastProvider } from "@/components/toast";
import { Meta } from "@/components/meta";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <I18nProvider>
      <ToastProvider>
        <Meta />
        <Component {...pageProps} />
      </ToastProvider>
    </I18nProvider>
  );
}
