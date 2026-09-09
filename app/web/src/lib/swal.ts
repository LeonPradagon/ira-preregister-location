import Swal, { SweetAlertIcon } from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

interface ConfirmActionOptions {
  title: string;
  text?: string;
  confirmButtonText: string;
  cancelButtonText: string;
  icon?: SweetAlertIcon;
  confirmButtonColor?: string;
  onConfirm?: () => Promise<void>;
}

export async function confirmAction({
  title,
  text,
  confirmButtonText,
  cancelButtonText,
  icon = 'question',
  confirmButtonColor = '#2563eb',
  onConfirm,
}: ConfirmActionOptions): Promise<boolean> {
  const result = await Swal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor,
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    showLoaderOnConfirm: Boolean(onConfirm),
    preConfirm: onConfirm
      ? async () => {
          try {
            await onConfirm();
            return true;
          } catch (cause) {
            Swal.showValidationMessage(cause instanceof Error ? cause.message : 'Action could not be completed.');
            return false;
          }
        }
      : undefined,
  });
  return result.isConfirmed;
}

export async function showActionSuccess(title: string, text?: string): Promise<void> {
  await Swal.fire({
    icon: 'success',
    title,
    text,
    confirmButtonText: 'OK',
    confirmButtonColor: '#2563eb',
    allowOutsideClick: false,
  });
}

export async function showActionError(title: string, text?: string): Promise<void> {
  await Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'OK',
    confirmButtonColor: '#2563eb',
  });
}
