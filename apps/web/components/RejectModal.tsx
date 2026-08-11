"use client";

import { useState } from "react";

interface RejectModalProps {
  siteName: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

export function RejectModal({ siteName, onCancel, onSubmit }: RejectModalProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="통제 권고 기각">
        <h2>{siteName} 통제 권고 기각</h2>
        <p>기각 사유는 필수입니다. 사유 없이는 제출할 수 없습니다.</p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 현장 확인 결과 오탐으로 판단, 수위 안정적"
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="btn btn-danger" disabled={!canSubmit} onClick={() => onSubmit(trimmed)}>
            기각 제출
          </button>
        </div>
      </div>
    </div>
  );
}
