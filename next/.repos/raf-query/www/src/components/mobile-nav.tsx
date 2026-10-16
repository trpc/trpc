import { Button } from "@examples/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@examples/ui/components/dialog";
import { Menu } from "lucide-react";
import { useState } from "react";

import { DocsNav } from "./docs-nav.tsx";

export function MobileNav() {
	const [open, setOpen] = useState(false);
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger
				render={
					<Button
						aria-label="Open navigation"
						className="md:hidden"
						size="icon-sm"
						title="Open navigation"
						variant="ghost"
					/>
				}
			>
				<Menu />
			</DialogTrigger>
			<DialogContent className="top-0 left-0 h-dvh max-w-80 translate-x-0 translate-y-0 overflow-y-auto rounded-none border-r p-5 sm:max-w-80">
				<DialogTitle>Documentation</DialogTitle>
				<DialogDescription className="sr-only">
					Every page of the raf-query docs
				</DialogDescription>
				<DocsNav
					onNavigate={() => {
						setOpen(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
