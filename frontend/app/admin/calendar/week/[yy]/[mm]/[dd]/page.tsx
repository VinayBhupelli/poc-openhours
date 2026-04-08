"use client";

import { useMemo } from "react";
import CalendarPage from "../../../../page";

export default function CalendarWeekPage({
  params,
}: {
  params: { yy: string; mm: string; dd: string };
}) {
  const initialDate = useMemo(() => {
    const rawY = params.yy;
    const yNum = parseInt(rawY, 10);
    const year =
      rawY.length === 2 ? (yNum < 70 ? 2000 + yNum : 1900 + yNum) : yNum;

    const month = params.mm.padStart(2, "0");
    const day = params.dd.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, [params]);

  return <CalendarPage initialDate={initialDate} />;
}

