/**
 * Tests for rooms keeping up with their walls (lib/room-follow.ts)
 *
 * Run with:   npx tsx __tests__/room-follow.test.ts
 */
import { followWalls, reanchorLabels, newUnnamedRooms, type FollowWall, type FollowTarget } from '../lib/room-follow'
import { rectFromCorners, roomFromPolygon, isAxisRect, type Pt, type DetectedRoom, type RoomLabel } from '../lib/rooms-from-walls'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, JSON.stringify(x) ?? '')) }
const P = (x: number, y: number): Pt => ({ x, y })
const near = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01
const all = (a: Pt[] | null, b: Pt[]) => !!a && a.length === b.length && a.every((p, i) => near(p, b[i]))
const mpp = 0.01, tol = 12

// a room 6m x 4m inside outside walls 300 thick, drawn clockwise along their outside face (faces: 0 and 30 to the right, i.e. inward)
const wall = (id: string, a: Pt, b: Pt, lo = 0, hi = 30): FollowWall => ({ id, points: [a, b], closed: false, lo, hi })
const house = (dxRight = 0, dyBottom = 0): FollowWall[] => [
  wall('top', P(0, 0), P(660 + dxRight, 0)), wall('right', P(660 + dxRight, 0), P(660 + dxRight, 460 + dyBottom)), wall('bottom', P(660 + dxRight, 460 + dyBottom), P(0, 460 + dyBottom)), wall('left', P(0, 460 + dyBottom), P(0, 0)),
]
const room: FollowTarget = { points: rectFromCorners(P(30, 30), P(630, 430)), kind: 'room', rect: true }

const r1 = followWalls(house(), house(100), [room], tol)[0]
t('right wall pushed out: the room on its inside faces widens with it', all(r1, rectFromCorners(P(30, 30), P(730, 430))), r1)
const r2 = followWalls(house(), house(-200, 50), [room], tol)[0]
t('two walls at once: narrower and deeper', all(r2, rectFromCorners(P(30, 30), P(430, 480))), r2)
t('it stays a rectangle', !!r2 && isAxisRect(r2))
t('nothing moved: nothing changes', followWalls(house(), house(), [room], tol)[0] === null)
const free: FollowTarget = { points: rectFromCorners(P(200, 200), P(400, 300)), kind: 'room', rect: true }
t('a room away from the walls stays put', followWalls(house(), house(100), [free], tol)[0] === null)
const part: FollowTarget = { points: rectFromCorners(P(30, 30), P(300, 430)), kind: 'room', rect: true }
t('a room touching only the walls that did not move stays put', followWalls(house(), house(100), [part], tol)[0] === null)
// the whole house moved: the room moves with it, once
const shifted = house().map(w => ({ ...w, points: w.points.map(p => P(p.x + 50, p.y + 20)) }))
const r3 = followWalls(house(), shifted, [room], tol)[0]
t('the whole house moved: the room goes with it, the same distance (not twice)', all(r3, rectFromCorners(P(80, 50), P(680, 450))), r3)

// three walls and an open side closed by a room edge
const three = (extend = 0): FollowWall[] => [wall('left', P(0, 400), P(0, 0)), wall('top', P(0, 0), P(600, 0)), wall('right', P(600, 0), P(600, 400 + extend))]
const edge: FollowTarget = { points: [P(30, 400), P(570, 400)], kind: 'edge' }
const e1 = followWalls(three(), three(100), [edge], tol)[0]
t('a wall made longer: the edge end at the end of it goes with it, the other end stays', !!e1 && near(e1[1], P(570, 500)) && near(e1[0], P(30, 400)), e1)
const rightOut = [three()[0], wall('top', P(0, 0), P(700, 0)), wall('right', P(700, 0), P(700, 400))]
const e2 = followWalls(three(), rightOut, [edge], tol)[0]
t('a side wall moved out: the edge stretches to it', !!e2 && near(e2[1], P(670, 400)) && near(e2[0], P(30, 400)), e2)

// a partition drawn along its middle, 100 thick: a room against its face follows when it moves
const partition = (x: number) => [wall('p', P(x, 0), P(x, 400), -5, 5)]
const against: FollowTarget = { points: rectFromCorners(P(30, 30), P(295, 370)), kind: 'room', rect: true }
const r4 = followWalls(partition(300), partition(350), [against], tol)[0]
t('a partition moved: the room against it follows its face', all(r4, rectFromCorners(P(30, 30), P(345, 370))), r4)
t('a wall that disappears or changes its corners moves nothing', followWalls(partition(300), [], [against], tol)[0] === null && followWalls(partition(300), [{ id: 'p', points: [P(1, 1), P(2, 2), P(3, 3)], closed: false, lo: -5, hi: 5 }], [against], tol)[0] === null)
// any shape
const L: FollowTarget = { points: [P(30, 30), P(630, 30), P(630, 200), P(300, 200), P(300, 430), P(30, 430)], kind: 'room' }
const r5 = followWalls(house(), house(100), [L], tol)[0]
t('an L-shaped room: only the corners on the wall move', !!r5 && near(r5[1], P(730, 30)) && near(r5[2], P(730, 200)) && near(r5[3], P(300, 200)) && near(r5[4], P(300, 430)), r5)

// names stay with their rooms
const R = (a: Pt, b: Pt): DetectedRoom => roomFromPolygon(rectFromCorners(a, b), mpp)!
const label: RoomLabel = { id: 'k', name: 'Kitchen', x: 500, y: 200 }
const kept = reanchorLabels([label], [R(P(30, 30), P(630, 430))], [R(P(30, 30), P(400, 430))])
t('a wall moved past the name: the name goes to the room as it is now', !!kept && kept[0].name === 'Kitchen' && kept[0].x < 400, kept)
t('a name still inside its room is left alone', reanchorLabels([{ ...label, x: 100 }], [R(P(30, 30), P(630, 430))], [R(P(30, 30), P(400, 430))]) === null)
t('it does not take the name into a room that has one', reanchorLabels([label, { id: 'h', name: 'Hall', x: 100, y: 100 }], [R(P(30, 30), P(630, 430))], [R(P(30, 30), P(400, 430))]) === null)
t('a name whose room has gone altogether is left where it is', reanchorLabels([label], [R(P(30, 30), P(630, 430))], []) === null)
const split = reanchorLabels([label], [R(P(30, 30), P(630, 430))], [R(P(30, 30), P(200, 430)), R(P(210, 30), P(450, 430))])
t('with two rooms to choose from it takes the bigger share', !!split && split[0].x > 210 && split[0].x < 450, split)

// which rooms to ask a name for
const a = R(P(0, 0), P(300, 300)), b = R(P(400, 0), P(900, 300))
t('a room that has just appeared is asked about', newUnnamedRooms([a], [a, b], []).length === 1 && newUnnamedRooms([a], [a, b], [])[0] === b)
t('one that was there before is not', newUnnamedRooms([a, b], [a, b], []).length === 0)
t('one with a name is not', newUnnamedRooms([], [b], [{ id: 'x', name: 'Lounge', x: 500, y: 100 }]).length === 0)
const halves = newUnnamedRooms([R(P(0, 0), P(600, 300))], [R(P(0, 0), P(290, 300)), R(P(310, 0), P(600, 300))], [])
t('a room cut in two asks about both halves', halves.length === 2)
t('the biggest first', newUnnamedRooms([], [a, b], [])[0] === b)

console.log(`${ok} passed, ${bad} failed`)
if (bad) process.exit(1)
