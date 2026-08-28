asia-southeast1: Jurong West, Singapore
australia-southeast1: Sydney, Australia



## Realtime Database | asia-southwest1
### Structure
- Old grid topics (deprectated)


- Quizes (JSON list of questions and answers)


- OTP password hashes 


- Messages (Contact us messages, or support messages)


- Licences
    * customerID (stripe customer id)
    * disabled 
    * isTest
    * licenceName (user defined licence name)
    * oldTier 
    * seats 
    * tier 
    * users
        + email
        + linked
        + name
        + status (staff | admin | owner)

    
- Session Data 
    - session states (e.g cursor position, page, ... ect)

- User details
    - usage
        - files (number of files)
        - grids (number of grids)
        - minutes (number of minutes used since the last month)
        - quizzes (number of quizzes)
        - sessions (number of sessions had since the last month)
        - storage (the amount of MB is storage)
        - month (the month since last reset)
        - year (the year since last reset)

    - licences (A list of licence IDs)
    - max-tier (The max tier of the user)

    - metrics 
        - time of creation
        - last sign in
        - email 

    - session-history
        - duration
        - info
            - description
            - duration
            - startDate
            - startTime
            - timezone

    - settings 
        - setting profile image
        - setting profile name
        - squidly session settings (see squidly settings
                                        e.g. volume, cursor display ..., ect)
        
        - profile-logs
            - aac words used
            - access methods used
            - settings changed 
            - apps used
                - heatmaps
                - interaction counts per access method
            
        - info
            - email
            - displayName
            - displayPhoto 
            - firstName
            - lastName
            - pronouns 

            - dark (dark mode toggle)
            - optionalData (unused toggle)
            - requiredData (unused toggle)

            - Session start video/audio mute states
                - hostAudio
                - hostVideo
                - participantAudio
                - participantVideo



## Storage | australia-southeast1
### structure
- Icon images
- Open board files
- Board thumbnails
- Utterance audio files 
- User profile pictures
- Session share file content (this is deleted after the session is ended)



## Firestore | australia-southeast1
### structure 
- Icon metadata
    - iconSet
    - name
    - phash
    - public
    - data url
    - type
    - embedding
    - uid (owner)

- Utterances metadata
    - text value
    - data url

- Board metadata
    - path
    - isDirectory
    - owner 
    - createdAt, deletedAt, updatedAt
    - public, favourite, effectivePublic

- Draft Board Data
    - board (JSON string, see Open board format)
    - version number



