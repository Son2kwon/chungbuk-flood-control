import type { SiteType } from "@chungbuk/data";

export interface NotificationRecord {
  id: string;
  siteId: string;
  siteName: string;
  sentAt: Date;
  targetArea: string;
  message: string;
  detour: string;
}

const DETOUR_BY_TYPE: Record<SiteType, string> = {
  underpass: "지하차도 진입을 금지합니다. 인근 지상도로로 우회해 주시기 바랍니다.",
  lowbridge: "세월교 통행을 금지합니다. 인근 상시 교량으로 우회해 주시기 바랍니다.",
  riverside_road: "하상도로 통행을 금지합니다. 인근 제방 위 도로로 우회해 주시기 바랍니다.",
};

/**
 * 승인 시점에 자동 생성되는 주민 알림 문구. 실제 발송은 하지 않는 mock이다 —
 * 실제 운영에서는 이 문구가 긴급재난문자(CBS)로 나간다.
 */
export function buildNotification(
  site: { id: string; name: string; type: SiteType },
  sentAt: Date,
  idSuffix: number,
): NotificationRecord {
  return {
    id: `notify-${site.id}-${idSuffix}`,
    siteId: site.id,
    siteName: site.name,
    sentAt,
    targetArea: `${site.name} 인근`,
    message: `[긴급] ${site.name} 인근 침수 위험으로 차량 통행을 통제합니다. 우회로를 이용해 주시기 바랍니다.`,
    detour: DETOUR_BY_TYPE[site.type],
  };
}
