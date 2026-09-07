import Swal, { SweetAlertIcon } from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

interface ConfirmActionOptions {
  title: string;
  text?: string;
  confirmButtonText: string;
  cancelButtonText: string;
  icon?: SweetAlertIcon;
  confirmButtonColor?: string;
}

export async function confirmAction({
  title,
  text,
  confirmButtonText,
  cancelButtonText,
  icon = 'question',
  confirmButtonColor = '#2563eb',
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
