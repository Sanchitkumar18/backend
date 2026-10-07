// The Signal single/double-check delivery indicator.
import type { MessageStatus } from "@/lib/types";
import { CheckIcon, ClockIcon, DoubleCheckIcon } from "./Icons";

export default function StatusTicks({
  status,
  small = false,
}: {
  status: MessageStatus;
  small?: boolean;
}) {
  const size = small ? 14 : 16;
  if (status === "sending")
    return (
      <span className="checks">
        <ClockIcon size={small ? 12 : 13} />
      </span>
    );
  if (status === "sent")
    return (
      <span className="checks">
        <CheckIcon size={size - 1} />
      </span>
    );
  if (status === "delivered")
    return (
      <span className="checks">
        <DoubleCheckIcon size={size} />
      </span>
    );
  if (status === "read")
    return (
      <span className="checks read">
        <DoubleCheckIcon size={size} />
      </span>
    );
  return null;
}
