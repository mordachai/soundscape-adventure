# Tutorials
Tutorials for Soundscape Adventure (FoundryVTT V13). For V12 see [Tutorials](TUTORIAL.md).

## Creating a Soundscape
To create a new soundscape you need to select a folder to save a JSON file containing the configuration of the soundscape. During the creation you can select to load the sounds from the folder and its subfolders. After creating the soundscape, a new playlist with the name "Soundscape: [Soundscape Name]" will be created automatically.

[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/I8eFlDHm9iY)

## Loading a Soundscape
To load a soundscape you need to find the JSON file that contains the soundscape configuration. Keep in mind that FoundryVTT needs access to the sound files in the JSON to be able to load those into the playlist.

[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/Qg5GuvArrmk)

## Creating a Mood
To create a mood you need to type the mood name and save it. Each mood has three sound types with default "None" categories. All sounds added to the soundscape are available in the library.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/3YWAHSqRCLc)

## Sound Types
- **Library**: Available sounds from the playlist
- **Loop**: Continuous sounds until mood stops
- **Random**: Randomly triggered sounds
- **Soundpad**: One-time sounds (also available in the Soundpad UI)

## Moving Sounds
Drag and drop sounds between Library, categories, and sound types.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/8s4P6P7lq8A)

## Preview Sound
Preview sounds in Library before moving them.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/Rj6he5EK3O0)


## General Sound Configurations
Configure volume, enable/disable state, and other parameters. Settings are mood-specific. If you configure a sound in a mood, these configurations won't be replicated to other moods.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/YbfW36YJQVQ)

### Config Options for type Loop sounds (Sound settings)
Configuring the sound name applies to all moods. Other configurations like triggers, groups, and other options do not.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/QHsMczDRcqQ)

### Config Options for type Random sounds (Sound settings)
Configure random playback intervals.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/ZsQhAT4GZeg)

## Adding new sounds to the soundscape
Add sounds to the related playlist. 
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/VZ1QRBWfWoQ)

## Categories
Organize sounds by categories. Each category has the commands: enable all sounds, play all enabled sounds, stop all enabled sounds. These commands help to interact with all sounds in the category.

Same-named categories across types are linked (e.g., if you have "Rain" in Loop and "Rain" in Random, when you click on the play button for the Rain category in Loop, the enabled sounds in the Rain category from Random will also be played). This behavior doesn't apply when enabling all sounds in a category. This is useful for weather or scene situations.

### Creating Category
You can create multiple categories to organize the sounds, or just to group sounds you want to control.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/QCy69Ps59IY)

### Category Commands
The category commands help you interact with the sounds in the category and coordinate playing sounds across types.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/YayGXFskgcI)

## Loop sounds
Continuous playback when mood is active.

### Loop Sound Groups
Grouped sounds get intensity control (0-100%). Name sounds sequentially (rain1, rain2, etc.). Lower intensity = lower numbered sound.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/GbwM0BfMQFY)

## Random Sounds
Play at intervals (multiple times or once). Groups cycle through sounds without repeating.

### Random Sound Groups
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/cfIsCf8nMNo)

## Soundpad Sounds
Quick-access sounds for GMs with dedicated UI. Add images for identification.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/CKvNwOUZbQ8)

## Triggers
Configure triggers to start/stop moods or sounds. Three main types cover most use cases:

### Scenes
Auto-start moods when scenes activate. Previous moods stop automatically.



### Regions
You can trigger moods with region triggers.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/iIaTGryyW_Y)

### Combat
When combat starts or stops you can play or stop moods.
[![Watch the video](https://www.pngkey.com/png/full/333-3339295_98-buck-social-watch-video-logo-png.png)](https://youtu.be/UIntmpJn4l4)