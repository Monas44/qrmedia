/**
 * Equivalente ao ctx.waitUntil(): roda trabalho depois da resposta, sem
 * bloquear nem derrubar a requisição. `idle()` permite esperar tudo terminar
 * (testes e desligamento gracioso).
 */
export class BackgroundTasks {
  private readonly pending = new Set<Promise<unknown>>();

  run(task: Promise<unknown>): void {
    const p = task
      .catch((err) => console.error('background_task_failed', err))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}
