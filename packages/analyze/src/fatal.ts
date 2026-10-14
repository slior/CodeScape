export class SnapshotFatal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotFatal";
  }
}
