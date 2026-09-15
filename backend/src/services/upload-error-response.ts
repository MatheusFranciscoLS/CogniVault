export type UploadErrorResponse = {
  status: 400 | 413;
  message: string;
};

export function uploadErrorResponse(code: string): UploadErrorResponse {
  switch (code) {
    case 'LIMIT_FILE_SIZE':
      return { status: 413, message: 'O PDF excede o limite de 50 MB.' };
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return { status: 400, message: 'Envie apenas um PDF por requisição.' };
    case 'LIMIT_FIELD_COUNT':
      return { status: 400, message: 'O upload aceita no máximo três campos de metadados.' };
    case 'LIMIT_PART_COUNT':
      return { status: 400, message: 'O formulário de upload contém partes demais.' };
    case 'LIMIT_FIELD_VALUE':
      return { status: 413, message: 'Um campo de metadados do upload excede 1 KB.' };
    case 'LIMIT_FIELD_KEY':
      return { status: 400, message: 'O nome de um campo do upload excede o limite permitido.' };
    default:
      return { status: 400, message: 'Não foi possível receber o arquivo enviado.' };
  }
}
