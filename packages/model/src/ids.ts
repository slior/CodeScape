function len(component: string): string {
  return `${Buffer.byteLength(component, "utf8")}:${component}`;
}

export function cityId(basename: string): string {
  return `city:${len(basename)}`;
}

export function districtId(packagePath: string): string {
  return `district:${len(packagePath)}`;
}

export function buildingId(path: string): string {
  return `building:${len(path)}`;
}

export function fileBoxId(filePath: string): string {
  return `box:${len(filePath)}`;
}

export function symbolBoxId(filePath: string, name: string): string {
  return `box:${len(filePath)}${len(name)}`;
}

export function portalId(parentId: string, packageName: string): string {
  return `portal:${len(parentId)}${len(packageName)}`;
}

export function edgeId(parentId: string, fromId: string, toId: string): string {
  return `edge:${len(parentId)}${len(fromId)}${len(toId)}`;
}
