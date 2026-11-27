import { Toaster } from 'sonner';

export function DashboardToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      richColors
      closeButton
      visibleToasts={4}
      offset="24px"
      toastOptions={{
        duration: 5000,
      }}
    />
  );
}
