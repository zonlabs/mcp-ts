export default function NotFound() {
  return (
    <div className="flex flex-1 w-full min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 select-none bg-transparent">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl text-foreground">
          404 Not Found
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground leading-relaxed">
          The requested resource does not exist, may have been removed, or is no longer available.
        </p>
      </div>
    </div>
  );
}


