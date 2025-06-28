import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

export function UiOverview() {
  return (
    <Tabs items={['Docs Layout', 'Docs Layout (Mobile)']}>
      <Tab
        value="Docs Layout"
        className="not-prose text-sm text-center text-fd-muted-foreground overflow-auto"
      >
        <div className="flex flex-row gap-4 min-w-[600px] min-h-[400px]">
          <div className="flex flex-col gap-2 w-1/4">
            <p className="text-xs">Sidebar</p>
            <div className="border p-2 bg-fd-muted">Title</div>
            <div className="border p-2 bg-fd-muted">Sidebar Tabs</div>
            <div className="border p-2 bg-fd-muted">Search</div>
            <div className="flex items-center justify-center border p-2 flex-1 bg-fd-muted">
              Page Tree
            </div>
            <div className="border p-2 mt-auto bg-fd-muted">Footer</div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <p className="text-xs">Docs Page</p>
            <div className="bg-fd-muted border p-2">Article Title</div>
            <div className="bg-fd-muted border p-2">Description</div>
            <div className="bg-fd-muted border flex items-center justify-center flex-1 py-2">
              Body
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border p-2 bg-fd-muted">Edit on GitHub</div>
              <div className="border p-2 bg-fd-muted">Last Updated</div>
            </div>
            <div className="border p-2">
              <p className="text-xs mb-2">Footer</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="border p-2 bg-fd-muted">Previous</div>
                <div className="border p-2 bg-fd-muted">Next</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-1/4">
            <p className="text-xs">TOC</p>
            <div className="border p-2 bg-fd-muted">Banner</div>
            <div className="flex items-center justify-center border p-2 flex-1 bg-fd-muted">
              Items
            </div>
            <div className="border p-2 bg-fd-muted">Footer</div>
          </div>
        </div>
      </Tab>
      <Tab
        value="Docs Layout (Mobile)"
        className="not-prose text-sm text-center text-fd-muted-foreground overflow-auto"
      >
        <div className="flex flex-row gap-4 min-w-[600px]">
          <div className="flex flex-col gap-2 p-2 border">
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
            <div className="bg-fd-muted border flex items-center justify-center flex-1 py-2">
              Body
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border p-2 bg-fd-muted">Edit on GitHub</div>
              <div className="border p-2 bg-fd-muted">Last Updated</div>
            </div>
            <div className="border p-2">
              <p className="text-xs mb-2">Footer</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="border p-2 bg-fd-muted">Previous</div>
                <div className="border p-2 bg-fd-muted">Next</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 p-2 border">
            <div className="border p-2">
              <p className="text-xs">Nav</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-fd-muted border p-2">Title</div>
                <div className="bg-fd-muted border p-2">Search</div>
                <div className="bg-fd-muted border p-2">Menu</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 p-2 border h-full">
              <p className="text-xs">Sidebar</p>
              <div className="border p-2 bg-fd-muted">Sidebar Tabs</div>
              <div className="border p-2 bg-fd-muted">Search</div>
              <div className="flex items-center justify-center border p-2 flex-1 bg-fd-muted">
                Page Tree
              </div>
              <div className="border p-2 mt-auto bg-fd-muted">Footer</div>
            </div>
          </div>
        </div>
      </Tab>
    </Tabs>
  );
}
