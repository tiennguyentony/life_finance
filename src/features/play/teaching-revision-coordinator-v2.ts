type StateBoundCommandV2 = Readonly<{
  expectedRevision: number;
  effectiveMonth: string;
}>;

type RevisionStateV2 = Readonly<{
  revision: number;
  currentMonth: string;
}>;

export function rebaseStateBoundCommandV2<TCommand extends StateBoundCommandV2>(
  command: TCommand,
  state: Readonly<{
    revision: number;
    currentMonth: TCommand["effectiveMonth"];
  }>,
): TCommand {
  return {
    ...command,
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
  };
}

export class TeachingRevisionCoordinatorV2 {
  private tail: Promise<void> = Promise.resolve();
  private session = 0;
  private readonly teachingOnlyRevisions = new Map<
    number,
    Readonly<{ toRevision: number; currentMonth: string }>
  >();

  run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  captureSession(): number {
    return this.session;
  }

  isSessionCurrent(session: number): boolean {
    return Number.isSafeInteger(session) && session === this.session;
  }

  recordTeachingOnlyRevision(
    before: RevisionStateV2,
    after: RevisionStateV2,
  ): boolean {
    if (
      !Number.isSafeInteger(before.revision) ||
      !Number.isSafeInteger(after.revision) ||
      after.revision !== before.revision + 1 ||
      before.currentMonth !== after.currentMonth
    ) return false;
    const existing = this.teachingOnlyRevisions.get(before.revision);
    if (
      existing &&
      (existing.toRevision !== after.revision ||
        existing.currentMonth !== after.currentMonth)
    ) return false;
    this.teachingOnlyRevisions.set(before.revision, {
      toRevision: after.revision,
      currentMonth: after.currentMonth,
    });
    return true;
  }

  canRebaseAcrossTeachingOnly(
    command: StateBoundCommandV2,
    latest: RevisionStateV2,
  ): boolean {
    if (command.effectiveMonth !== latest.currentMonth) return false;
    if (command.expectedRevision === latest.revision) return true;
    if (command.expectedRevision > latest.revision) return false;
    let revision = command.expectedRevision;
    while (revision < latest.revision) {
      const transition = this.teachingOnlyRevisions.get(revision);
      if (
        !transition ||
        transition.currentMonth !== latest.currentMonth ||
        transition.toRevision !== revision + 1
      ) return false;
      revision = transition.toRevision;
    }
    return revision === latest.revision;
  }

  reset(): void {
    this.session = this.session === Number.MAX_SAFE_INTEGER ? 0 : this.session + 1;
    this.teachingOnlyRevisions.clear();
  }
}
