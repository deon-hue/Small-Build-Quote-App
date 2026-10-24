'use client'

/**
 * Hands the Tiling Preparation calculator the Wall Tiling areas saved elsewhere in the same quote or take-off (see lib/tiling-share.ts), so it can offer "copy the wall areas from Wall Tiling". The quote workspace and
 * Take-off wrap the calculator in the provider; anywhere else (the Back Office preview) there is no provider and the button is not shown.
 */

import React, { createContext, useContext } from 'react'
import type { SharedWallRoom } from '@/lib/tiling-share'

const Ctx = createContext<SharedWallRoom[] | undefined>(undefined)

export function SharedWallAreasProvider({ rooms, children }: { rooms: SharedWallRoom[]; children: React.ReactNode }) {
  return <Ctx.Provider value={rooms}>{children}</Ctx.Provider>
}

/** The Wall Tiling rooms saved in this quote or take-off; undefined where there is no quote or take-off to look in. */
export function useSharedWallRooms(): SharedWallRoom[] | undefined {
  return useContext(Ctx)
}
