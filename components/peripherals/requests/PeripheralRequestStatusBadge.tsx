import {
  PERIPHERAL_REQUEST_STATUS_LABEL,
  PERIPHERAL_REQUEST_STATUS_STYLE,
  type PeripheralRequestStatus,
} from "@/lib/peripheral-requests"
import { cn } from "@/lib/utils"

/** Pílula de status do pedido — a mesma no site e no painel. */
export function PeripheralRequestStatusBadge({
  status,
  className,
}: {
  status: PeripheralRequestStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        PERIPHERAL_REQUEST_STATUS_STYLE[status],
        className
      )}
    >
      {PERIPHERAL_REQUEST_STATUS_LABEL[status]}
    </span>
  )
}
