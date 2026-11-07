# 014 - Share one ground coordinate frame

## Status

Accepted on 2026-10-14.

Depends on:

- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)

## Context

Layout and the viewer must agree on what a pose means. The viewer does not re-layout the city. It walks the coordinates layout stored.

## Decision

Y is up. +x is east. +z is north. The origin is (0, 0). There is no y on a pose. Height is the pose height field. The city's footprint minimum corner is the origin.

- Pose.x and Pose.z are the minimum corner of the footprint. width extends toward +x. depth extends toward +z.
- Every city, district, building, and box footprint has a minimum, width, and depth that are multiples of 2.
- Street cells are 2-by-2 squares whose minimum corners lie on multiples of 2. A cell key is "x,z" of that minimum corner. The viewer uses the same key.
- An edge point is the center of a street cell. Minimum corner (x, z) is stored as (x + 1, z + 1).
- Portal marker poses are exempt from the 2-unit rule. A marker center follows the courtyard rim. Its minimum corner is that center minus 4 on x and on z. The marker is 8 by 8 by 8. How the rim position is chosen is [018 - Route streets with a deterministic search](018-deterministic-street-routing.md). The exemption is this record.
- roundCoord, used by layout and by serializeWorld, throws if a coordinate is not finite. Otherwise it rounds half away from zero to two decimal places, and returns 0 when the rounded value is zero.

## Consequences

- The grid size is a shared constant. Changing it from 2 means changing layout's street graph and the viewer's walkable cells together. A mismatch puts the camera inside a block or off the polyline.
- Portal centers can sit off the grid. Their minimum corners can be fractional after rounding to two decimals. Block footprints cannot.
- North is +z. The viewer starts on the south rim looking north, which is a low z looking toward +z. A renderer that treats +z as south would mirror the city.
- Edge points are centers, not corners. A consumer that treats points as minimum corners will draw the road one unit off.
- Rounding is part of the contract. Layout's portal-gap check uses the same rounding the serializer will apply, so a gap that exists before rounding is not trusted.
