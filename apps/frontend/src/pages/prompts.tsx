export const PromptsPage = () => {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Prompts</h1>
        <p className="text-muted-foreground">Manage your prompt templates and evaluate changes.</p>
      </div>
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Prompt lists will live here. Use TanStack Query to load your workspace prompts.
      </div>
    </section>
  );
};
