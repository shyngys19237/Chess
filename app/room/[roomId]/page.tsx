"use client";

import { useParams } from "next/navigation";
import { RoomBoard } from "@/components/chess/room-board";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params?.roomId ?? "demo-room";

  return (
    <div className="page-shell py-8 sm:py-12">
      <RoomBoard roomId={roomId} />
    </div>
  );
}
