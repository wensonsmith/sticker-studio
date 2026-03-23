import { isStickerizeError } from "@/lib/stickerize/errors";

export function jsonErrorResponse(error: unknown) {
  if (isStickerizeError(error)) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  console.error(error);

  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong while generating the sticker.",
      },
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
