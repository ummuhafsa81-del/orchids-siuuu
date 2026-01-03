export const NovaLogoSvg = ({
  className = "h-16 w-auto",
}: {
  className?: string;
}) => (
  <div className={className}>
    <style>{`
      .nova-text {
        font-size: inherit;
        font-weight: 800;
        letter-spacing: 0.05em;
        background: linear-gradient(135deg, #FF006E 0%, #FF5B8F 25%, #FF7A00 75%, #FFA500 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-family: 'Inter', 'Helvetica Neue', sans-serif;
      }
    `}</style>
    <div className="nova-text" style={{ fontSize: "inherit", lineHeight: 1 }}>
      NOVA
    </div>
  </div>
);
