
-- create triggers whenever something is added or removed from the IsTyping table
-- this will be used to notify clients when someone starts or stops typing
CREATE OR REPLACE FUNCTION notify_is_typing() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('is_typing', null);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER is_typing_notify_insert
AFTER INSERT ON "IsTyping"
FOR EACH ROW
EXECUTE FUNCTION notify_is_typing();

CREATE TRIGGER is_typing_notify_delete
AFTER DELETE ON "IsTyping"
FOR EACH ROW
EXECUTE FUNCTION notify_is_typing();

-- create triggers for the Post table
-- this will be used to notify clients when a new post is created

CREATE OR REPLACE FUNCTION notify_new_post() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('new_post', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER new_post_notify_insert
AFTER INSERT ON "Post"
FOR EACH ROW
EXECUTE FUNCTION notify_new_post();

