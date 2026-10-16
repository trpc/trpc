import * as React from "react";
import { logoUrl } from "@examples/kit/lib/logo";
import { cn } from "@examples/ui/lib/utils";

function Logo({
	alt = "raf-query",
	className,
	...props
}: Omit<React.ComponentProps<"img">, "src">) {
	return (
		<img
			alt={alt}
			className={cn("size-6 shrink-0", className)}
			data-slot="logo"
			height={32}
			src={logoUrl}
			width={32}
			{...props}
		/>
	);
}

export { Logo };
