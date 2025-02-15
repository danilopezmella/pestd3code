const LoadingDots = () => (
  <div className="flex gap-2">
    <div className="w-2 h-2 bg-primary rounded-full animate-pulse-modflowai" />
    <div className="w-2 h-2 bg-primary rounded-full animate-pulse-modflowai [animation-delay:0.2s]" />
    <div className="w-2 h-2 bg-primary rounded-full animate-pulse-modflowai [animation-delay:0.4s]" />
  </div>
);

export default LoadingDots;