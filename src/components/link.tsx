export const Link = ({ url, label }: { url: string; label: string }) => {
  return (
    <a
      className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors duration-150"
      target="_blank"
      rel="noopener noreferrer"
      href={url}
    >
      {label}
    </a>
  );
};
