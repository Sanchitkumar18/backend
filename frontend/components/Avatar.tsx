import { assetUrl } from "@/lib/api";
import { initials } from "@/lib/format";

interface Props {
  name: string;
  color: string;
  url?: string | null;
  size?: number;
  online?: boolean;
  showPresence?: boolean;
}

export default function Avatar({
  name,
  color,
  url,
  size = 46,
  online = false,
  showPresence = false,
}: Props) {
  const inner = (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: url ? undefined : color,
        fontSize: size * 0.4,
      }}
    >
      {url ? <img src={assetUrl(url)} alt={name} /> : initials(name)}
    </div>
  );

  if (!showPresence) return inner;
  return (
    <div className="avatar-presence" style={{ width: size, height: size }}>
      {inner}
      {online && <span className="dot" />}
    </div>
  );
}
