# Home Assistant Swedish Timetable API
This is the home of Home Assistant Swedish Timetable API (HASTA) which is a free software for use with Home Assistant to enable lookup of Time Table Data from public transport providers. The software is available to create private instances of the service, however my hope is that I will be able to finish this off and provide it as a free SaaS for Home Assistant users.

### Still in development
This software still very much in development and therefore documentation is still lacking and the service is not yet open to the public but only in preview. I am are still testing out performance to be able to cope with the many millions of requires that the service will be processing per day and doing optimizations to achieve this.

>:warning: This is still so much in development that I am using a custom version of [node-gtfs](https://github.com/blinktaginc/node-gtfs) to provide some vital functions. This have not yet been merged (I have no idea if it will be either as we do massive updates) into the [node-gtfs](https://github.com/blinktaginc/node-gtfs) library. Until that happens or until I create my own fork of the library you can use the customized version from [dsorlov/node-gtfs](https://github.com/dsorlov/node-gtfs). This information will be updated as soon as I am ready to decide what route to take.

### Thanks to
A huge thanks to [brendannee](https://github.com/brendannee) who maintains the [node-gtfs](https://github.com/blinktaginc/node-gtfs) library which have been central to our development. HASTA have also provided some updates to the library for processing GTFS-RT data and some other optimizations.

### Contributing
Yes please! Do it!

File a bug, start a discussion, send an email or push code. It's your choice but it is very appreciated so I can complete this API (and the following Home Assistant integration).
