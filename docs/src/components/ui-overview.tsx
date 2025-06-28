import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

export function UiOverview() {
  return (
    <Tabs items={['Docs Layout', 'Docs Layout (Mobile)']}>
      <Tab
        value="Docs Layout"
        className="not-prose text-fd-muted-foreground overflow-auto text-center text-sm"
      >
        <div className="flex min-h-[400px] min-w-[600px] flex-row gap-4">
          <div className="flex w-1/4 flex-col gap-2">
            <p className="text-xs">Sidebar</p>
            <div className="bg-fd-muted border p-2">Title</div>
            <div className="bg-fd-muted border p-2">Sidebar Tabs</div>
            <div className="bg-fd-muted border p-2">Search</div>
            <div className="bg-fd-muted flex flex-1 items-center justify-center border p-2">
              Page Tree
            </div>
            <div className="bg-fd-muted mt-auto border p-2">Footer</div>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs">Docs Page</p>
            <div className="bg-fd-muted border p-2">Article Title</div>
            <div className="bg-fd-muted border p-2">Description</div>
            <div className="bg-fd-muted flex flex-1 items-center justify-center border py-2">
              Body
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-fd-muted border p-2">Edit on GitHub</div>
              <div className="bg-fd-muted border p-2">Last Updated</div>
            </div>
            <div className="border p-2">
              <p className="mb-2 text-xs">Footer</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-fd-muted border p-2">Previous</div>
                <div className="bg-fd-muted border p-2">Next</div>
              </div>
            </div>
          </div>
          <div className="flex w-1/4 flex-col gap-2">
            <p className="text-xs">TOC</p>
            <div className="bg-fd-muted border p-2">Banner</div>
            <div className="bg-fd-muted flex flex-1 items-center justify-center border p-2">
              Items
            </div>
            <div className="bg-fd-muted border p-2">Footer</div>
          </div>
        </div>
      </Tab>
      <Tab
        value="Docs Layout (Mobile)"
        className="not-prose text-fd-muted-foreground overflow-auto text-center text-sm"
      >
        <div className="flex min-w-[600px] flex-row gap-4">
          <div className="flex flex-col gap-2 border p-2">
            <div className="border p-2">
              <p className="text-xs">Nav</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-fd-muted border p-2">Title</div>
                <div className="bg-fd-muted border p-2">Search</div>
                <div className="bg-fd-muted border p-2">Menu</div>
              </div>
            </div>
            <div className="bg-fd-muted border p-2">TOC Trigger</div>

            <p className="text-xs">Docs Page</p>
            <div className="bg-fd-muted border p-2">Article Title</div>
            <div className="bg-fd-muted border p-2">Description</div>
            <div className="bg-fd-muted flex flex-1 items-center justify-center border py-2">
              Body
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-fd-muted border p-2">Edit on GitHub</div>
              <div className="bg-fd-muted border p-2">Last Updated</div>
            </div>
            <div className="border p-2">
              <p className="mb-2 text-xs">Footer</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-fd-muted border p-2">Previous</div>
                <div className="bg-fd-muted border p-2">Next</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border p-2">
            <div className="border p-2">
              <p className="text-xs">Nav</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-fd-muted border p-2">Title</div>
                <div className="bg-fd-muted border p-2">Search</div>
                <div className="bg-fd-muted border p-2">Menu</div>
              </div>
            </div>
            <div className="flex h-full flex-col gap-2 border p-2">
              <p className="text-xs">Sidebar</p>
              <div className="bg-fd-muted border p-2">Sidebar Tabs</div>
              <div className="bg-fd-muted border p-2">Search</div>
              <div className="bg-fd-muted flex flex-1 items-center justify-center border p-2">
                Page Tree
              </div>
              <div className="bg-fd-muted mt-auto border p-2">Footer</div>
            </div>
          </div>
        </div>
      </Tab>
    </Tabs>
  );
}
