Batch Example.
Run by starting the server with npm run dev in the ./server directory and starting the client by running dev in the ./client directory. This should start a project that shows several ways of using trpc to collect a Name and an Email in a solid.js client app (solid.js only being used as an example here but similar patterns are avialable is all modern frameworks and very common using context API's in certain cases).

There are 4 differnt patterns showns. I'll describe the Pro's and Con's as follows:

1. This is labeled the Naive approach. It follows a pattern of Inputs bound with updaters to the data which they update. They implement the data updaters using TRPC in this case. Trpc automatically batches the API calls into one request but the server operates on those requests individually. This is often fine for most usecases, especially early on in the lifecycle of an application and any deviation from this would be considered an optimization (likely to happen later in the lifecycle of an application if ever needed at all)

2. This uses the new Batch functionaly that I'm proposing. Note that the front-end client code can stay exactly the same, but the server code needs to be updated to add the expected batching functionality. The types automatically reflect this needed change on the server while allows the front-end to remain as it was. A benefit there being that this is a completely opt in optimization only neccesarry when the app grows to a complexity where NOT doing this would be an issue (likely fairly late in the development cycle)

3. This uses a manual batching operation (changing the input type to an array of updates). This requires the same change that number 2 does to take advantage of this batching but also requires significant changes to the client code. Whether this client code is better or worse is IMO up to interpritation and style. The key point is that it does require a significant change to the client code in this situation and while this code is simple in more mature codebases the refactor may be non-trivial.

4. This seeks to essentially use the inteface from number 3 but provide a DX similar to number 2. The main drawback here is that this type of code is complex to maintain and replicates essentially very similar code to what TRPC is already doing under the hood to batch requests at the HTTP level.

There are also solutions to the optimization issues present in example 1 which could theoretically be solved via more copmlex data layers. Some datalayers can provide this optimization out of the box or with very little configuration, but many others don't provide any level of optimization here and would require a complete handrolling of your own solutions (like if your data layer was 3rd party API's for instance).

Ultimately the proposed batching functionality is both a pure optimization and not functionality critical for any use cases and an optimization which could be performed at different levels (data layer, UI layer, etc.). That being said for certain usecases I think an optimization at this level is both the easiest to implement and leaves other layers the the most clean.

That ALSO being said if this either isn't the direction the core team wants to take the API (implicit data transformation) or even this work isn't worth the effort to maintain it (seeing as how this is a non-existential optimization path) I'm more than fine calling it here and closing this feature path.

Thanks again for taking the time to reivew this PR and double thanks on providing such a great piece of tech as OSS!
