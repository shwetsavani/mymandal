import React, { useEffect } from "react";

export default function ForgotPinScreen(props: { onDone: () => void }) {
    useEffect(() => props.onDone(), [props]);
    return null;
}
