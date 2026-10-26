'use client'

/**
 * Hands the Tiling Preparation calculator the Wall Tiling areas saved elsewhere in the same quote or take-off (see lib/tiling-share.ts), so it can offer "copy the wall areas from Wall Tiling". The quote workspace and
 * Take-off wrap the calculator in the provider; anywhere else (the Back Office preview) there is no provider and the button is not shown.
 */

import React, { createContext, useContext } from 'react'
import type { SharedWallRoom, SharedPrepFloor } from '@/lib/tiling-share'

const Ctx = createContext<SharedWallRoom[] | undefined>(undefined)
const PrepCtx = createContext<SharedPrepFloor[] | undefined>(undefined)

/** Hands the calculators what other lines saved in the same quote or take-off: the Wall Tiling areas (for Tiling Preparation) and, with `prepFloors`, the floors that have a decoupling membrane in Tiling Preparation (for Electric Underfloor Heating). */
export function SharedWallAreasProvider({ rooms, prepFloors, children }: { rooms: SharedWallRoom[]; prepFloors?: SharedPrepFloor[]; children: React.ReactNode }) {
  return <Ctx.Provider value={rooms}><PrepCtx.Provider value={prepFloors}>{children}</PrepCtx.Provider></Ctx.Provider>
}

/** The Wall Tiling rooms saved in this quote or take-off; undefined where there is no quote or take-off to look in. */
export function useSharedWallRooms(): SharedWallRoom[] | undefined {
  return useContext(Ctx)
}

/** The floors with a decoupling membrane saved in Tiling Preparation in this quote or take-off; undefined where there is no quote or take-off to look in. */
export function useSharedPrepFloors(): SharedPrepFloor[] | undefined {
  return useContext(PrepCtx)
}
